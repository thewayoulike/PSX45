import React, { useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';

/** Hover card rendered on the page, so a dashboard cell cannot clip it. */
export const HoverPopover: React.FC<{
  label: string;
  triggerClassName?: string;
  panelClassName?: string;
  align?: 'start' | 'center' | 'end';
  children: React.ReactNode;
  panel: React.ReactNode;
}> = ({ label, triggerClassName, panelClassName, align = 'start', children, panel }) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const show = () => {
    window.clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    timer.current = window.setTimeout(() => setOpen(false), 180);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={triggerClassName}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align={align}
          sideOffset={8}
          collisionPadding={12}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          onMouseEnter={show}
          onMouseLeave={hide}
          className={panelClassName}
        >
          {panel}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
