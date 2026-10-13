import { Anchor, type AnchorProps, NavLink, type NavLinkProps } from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef } from "react";

// Mantine components are polymorphic, which createLink cannot type, so each is pinned to <a> first.
type AnchorAttrs = Omit<ComponentPropsWithRef<"a">, "color" | "style">;

/** Mantine Anchor that navigates with the router. */
export const RouterAnchor = createLink((props: AnchorProps & AnchorAttrs) => <Anchor {...props} />);

/** Mantine NavLink that navigates with the router. */
export const RouterNavLink = createLink((props: NavLinkProps & Omit<AnchorAttrs, "onChange">) => (
  <NavLink {...props} />
));
