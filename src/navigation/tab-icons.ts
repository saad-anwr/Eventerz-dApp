/**
 * Tab-bar glyphs.
 *
 * Lucide's `House` and `UserRound` are the closest matches to the web nav's
 * icons; aliasing them here keeps the tab bar readable and means a future icon
 * swap happens in one place.
 */

export {
  House as Home,
  // `Compass` is the website's Explore glyph. Same icon, same slot, both
  // platforms - the point of the shared tab set.
  Compass,
  Users,
  Plus,
  Ticket,
  UserRound as User,
  type LucideIcon,
} from 'lucide-react-native';
