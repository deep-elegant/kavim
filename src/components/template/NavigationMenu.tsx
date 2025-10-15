import React from "react";
import { useTranslation } from "react-i18next";
import {
  NavigationMenu as NavigationMenuBase,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "../ui/navigation-menu";

export default function NavigationMenu() {
  const { t } = useTranslation();

  const navigationItems = React.useMemo(
    () => [
      { id: "home", label: t("titleHomePage"), href: "#home" },
      { id: "second", label: t("titleSecondPage"), href: "#second" },
    ],
    [t],
  );

  return (
    <NavigationMenuBase className="text-muted-foreground px-2">
      <NavigationMenuList>
        {navigationItems.map((item) => (
          <NavigationMenuItem key={item.id}>
            <NavigationMenuLink
              href={item.href}
              className={navigationMenuTriggerStyle()}
            >
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenuBase>
  );
}
