/**
 * Make a user-typed string safe to embed in a PostgREST `.or()` filter.
 *
 * Mirrors `postgrestLikePattern` in the website's `lib/supabase/data.ts` - both
 * clients build the same filters against the same database, so both need the
 * same escaping.
 *
 * `.or()` does not take parameters. It takes a string in PostgREST's own filter
 * grammar, which the server then parses, so interpolating raw input into it is
 * the same class of mistake as string-building SQL: the value stops being a
 * value the moment it contains a character the grammar treats as syntax.
 *
 * Three characters matter:
 *   `,`  separates conditions, so it appends a new OR branch
 *   `.`  separates column / operator / value
 *   `()` groups, and `(` opens a nested boolean expression
 *
 * A search for `x,id.eq.<uuid>` therefore stops being a search and becomes an
 * extra disjunct. RLS still applies underneath - which is why this is hardening
 * rather than an exposed record - but "the row filter downstream happens to
 * save us" is not the reason a query should be correct.
 *
 * The fix is PostgREST's own escape hatch: double quotes around the value, with
 * `"` and `\` backslash-escaped inside, which keeps the whole thing one literal
 * no matter what it contains.
 *
 * The quotes must wrap the **whole pattern, wildcards included** -
 * `ilike."%foo%"`, not `ilike.%"foo"%`. In the second form the quotes are just
 * characters in the middle of the pattern, so it matches nothing and the search
 * silently returns no results. Building the pattern here rather than at the
 * call site is what stops the two being assembled in the wrong order.
 */
export function postgrestLikePattern(value: string): string {
  const escaped = value.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}
