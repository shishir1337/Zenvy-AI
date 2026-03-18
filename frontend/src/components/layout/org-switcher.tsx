'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OrgSwitcher() {
  const router = useRouter();
  const { data: activeOrg } = authClient.useActiveOrganization();
  const { data: orgs } = authClient.useListOrganizations();
  const [creating, setCreating] = useState(false);

  // Auto-select organization when user has only one and none is active
  useEffect(() => {
    if (!orgs || orgs.length !== 1 || activeOrg) return;
    const org = orgs[0];
    if (org) {
      authClient.organization.setActive({ organizationId: org.id }).then(() => {
        router.refresh();
      });
    }
  }, [orgs, activeOrg, router]);

  const handleSetActive = async (orgId: string) => {
    await authClient.organization.setActive({ organizationId: orgId });
  };

  const handleCreateOrg = async () => {
    setCreating(true);
    const name = prompt('Organization name:');
    if (!name) {
      setCreating(false);
      return;
    }
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    await authClient.organization.create({ name, slug });
    setCreating(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center justify-start gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          {activeOrg?.name?.[0]?.toUpperCase() || '?'}
        </span>
        <span className="truncate">
          {activeOrg?.name || 'Select organization'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs?.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSetActive(org.id)}
            className={activeOrg?.id === org.id ? 'bg-accent' : ''}
          >
            <span className="mr-2 flex h-5 w-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
              {org.name[0].toUpperCase()}
            </span>
            {org.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCreateOrg} disabled={creating}>
          + Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
