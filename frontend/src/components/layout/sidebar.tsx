'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { OrgSwitcher } from './org-switcher';
import { UserMenu } from './user-menu';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/dashboard/inbox', label: 'Inbox', icon: '✉' },
  { href: '/dashboard/products', label: 'Products', icon: '☐' },
  { href: '/dashboard/orders', label: 'Orders', icon: '📋' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="p-4">
        <h1 className="mb-4 text-lg font-bold tracking-tight">
          Zenvy AI
        </h1>
        <OrgSwitcher />
      </div>

      <Separator />

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="p-3">
        <UserMenu />
      </div>
    </aside>
  );
}
