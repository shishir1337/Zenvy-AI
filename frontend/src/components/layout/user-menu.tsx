'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function UserMenu({ asSidebarTrigger }: { asSidebarTrigger?: boolean }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push('/sign-in');
  };

  if (!user) return null;

  const initials = user.name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const triggerContent = (
    <>
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.image || undefined} alt={user.name} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
    </>
  );

  // Use span/div instead of button - DropdownMenuTrigger renders a button, nesting causes hydration error
  const trigger = asSidebarTrigger ? (
    <span
      className="flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {triggerContent}
    </span>
  ) : (
    <span className="flex w-full items-center gap-2 rounded-md p-2 hover:bg-accent">
      <Avatar className="h-8 w-8">
        <AvatarImage src={user.image || undefined} alt={user.name} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <span className="hidden text-left text-sm md:block">
        <span className="block font-medium leading-none">{user.name}</span>
        <span className="block text-xs text-muted-foreground">{user.email}</span>
      </span>
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
