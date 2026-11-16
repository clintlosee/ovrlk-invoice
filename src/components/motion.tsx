import { AnimatePresence, motion, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const ease = [0.22, 1, 0.36, 1] as const;

const layout: Transition = { type: "spring", bounce: 0.16, duration: 0.42 };

export function NavHighlight() {
  return (
    <motion.span
      layoutId="nav-active"
      aria-hidden
      initial={false}
      className="pointer-events-none absolute inset-0 rounded-md bg-primary"
      transition={layout}
    />
  );
}

export function ActiveMark({ layoutId }: { layoutId: string }) {
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden
      initial={false}
      className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-solar"
      transition={layout}
    />
  );
}

export function Scrim({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.button
          key="scrim"
          type="button"
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
          aria-label="Close menu"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease }}
          onClick={onClose}
        />
      ) : null}
    </AnimatePresence>
  );
}

/** Exit, then enter. For a view swap on the same page. */
export function Swap({
  viewKey,
  children,
  className,
}: {
  viewKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2, ease }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Height plus fade, so a panel does not pop the page open. */
export function Reveal({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="reveal"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function Pop({
  show,
  children,
  className,
}: {
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {show ? (
        <motion.div
          key="pop"
          className={cn(className)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.16, ease }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
