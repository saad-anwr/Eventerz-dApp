/**
 * Icon layer.
 *
 * Two jobs:
 *
 * 1. **Re-export** the Lucide icons the app uses, so every component imports
 *    from one place and the icon set stays auditable. Only the icons in use are
 *    listed - importing all of `lucide-react-native` would pull ~1,500
 *    components into the bundle.
 *
 * 2. **Resolve by name** for data-driven icons. `Community.icon` and
 *    `Badge.icon` are plain strings so the models stay serialisable and can
 *    come from an API later; `getIcon` turns them back into components.
 */

import { createElement } from 'react';
import {
  BadgeCheck,
  Boxes,
  Building2,
  Compass,
  Flame,
  GraduationCap,
  Mic2,
  Palette,
  Rocket,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';

export {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Boxes,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  Clock,
  Coins,
  Compass,
  Copy,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Globe,
  GraduationCap,
  Grid2x2,
  Heart,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Link2,
  LoaderCircle,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Mic2,
  Moon,
  Palette,
  Pencil,
  Plus,
  QrCode,
  Rocket,
  RotateCcw,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Ticket,
  Trash2,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Icons addressable by name from data files. Keep this list tight - it only
 * needs the icons that appear as strings in `mock/` or on a model.
 */
const namedIcons = {
  BadgeCheck,
  Boxes,
  Building2,
  Compass,
  Flame,
  GraduationCap,
  Mic2,
  Palette,
  Rocket,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof namedIcons;

/** Resolve an icon by name, falling back to a neutral glyph when unknown. */
export function getIcon(name: string): LucideIcon {
  return namedIcons[name as IconName] ?? Sparkles;
}

export interface DynamicIconProps {
  /** Icon name from a data model, e.g. `Community.icon`. */
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Render an icon by name.
 *
 * Resolving `getIcon(...)` into a local `const Icon` and rendering `<Icon />`
 * inside a component body reads as creating a component during render, which
 * defeats memoisation and trips `react-hooks/static-components`. Doing the
 * lookup inside this stable component keeps the element type resolution out of
 * the caller's render path.
 */
export function DynamicIcon({
  name,
  size = 20,
  color = '#94a2b8',
  strokeWidth = 2,
}: DynamicIconProps) {
  // `createElement` rather than `const Icon = getIcon(name); <Icon />`: the
  // latter reads to the compiler as defining a component inside render. This is
  // a lookup in a module-level map - every icon is a stable, hoisted component.
  return createElement(getIcon(name), { size, color, strokeWidth });
}
