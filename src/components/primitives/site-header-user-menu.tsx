"use client";

import { UserButton } from "@clerk/nextjs";
import {
  HeartIcon,
  PackageIcon,
  SettingsIcon,
  ShirtIcon,
} from "lucide-react";

export function SiteHeaderUserMenu() {
  return (
    <UserButton
      appearance={{ elements: { avatarBox: "h-8 w-8" } }}
      userProfileMode="navigation"
      userProfileUrl="/settings"
    >
      <UserButton.MenuItems>
        <UserButton.Link
          label="My Closet"
          labelIcon={<ShirtIcon className="h-4 w-4" />}
          href="/profile"
        />
        <UserButton.Link
          label="Favorites"
          labelIcon={<HeartIcon className="h-4 w-4" />}
          href="/favorites"
        />
        <UserButton.Link
          label="Orders"
          labelIcon={<PackageIcon className="h-4 w-4" />}
          href="/orders"
        />
        <UserButton.Link
          label="Settings"
          labelIcon={<SettingsIcon className="h-4 w-4" />}
          href="/settings"
        />
      </UserButton.MenuItems>
    </UserButton>
  );
}
