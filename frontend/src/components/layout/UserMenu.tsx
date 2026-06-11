/**
 * UserMenu — avatar-initials dropdown for app headers: Settings + Log out.
 */

import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? source.charAt(0);
  const second = parts.length >= 2 ? (parts[1]?.charAt(0) ?? "") : "";
  return (first + second).toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          aria-label="Account menu"
        >
          <span className="flex h-7 w-7 select-none items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
            {initials(user?.full_name ?? null, user?.email ?? null)}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {user ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium text-text-primary">
                {user.full_name ?? "Your account"}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {user.email}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <Link to="/settings">
            <SettingsIcon className="h-4 w-4 text-text-secondary" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOut className="h-4 w-4 text-text-secondary" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
