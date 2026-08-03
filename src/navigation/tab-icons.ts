/**
 * Tab-bar glyphs.
 *
 * Lucide's `House` and `UserRound` are the closest matches to the web nav's
 * icons; aliasing them here keeps the tab bar readable and means a future icon
 * swap happens in one place.
 */

export {
  House as Home,
  // Community, Profile and Settings use the same glyphs as the website's nav,
  // so the two products read as one app in the same slots.
  Users,
  Plus,
  Settings,
  UserRound as User,
  type LucideIcon,
} from 'lucide-react-native';
