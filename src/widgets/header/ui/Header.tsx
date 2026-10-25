import { forwardRef, memo } from "react";
import { Link } from "react-router-dom";
import WindowControls from "@/features/navigation/ui/WindowControls";
import logo from "@/assets/logo.svg";
import { cn } from "@/shared/lib";

export interface HeaderProps {
  searchOpen?: boolean;
  onSearchToggle?: () => void;
  className?: string;
}

export const Header = forwardRef<HTMLElement, HeaderProps>(function Header(
  { className },
  ref,
) {
  const isMobile =
    typeof navigator !== "undefined" &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== "undefined" &&
        (window.location.hostname.includes("androidplatform") ||
          typeof (window as any).linerAndroidBridge !== "undefined" ||
          !(window as any).linerElectron)));

  return (
    <header
      ref={ref}
      data-window-drag
      className={cn(
        "relative z-45 w-full shrink-0 select-none bg-transparent h-[50px] flex items-center justify-between",
        className,
      )}
    >
      <div className="w-[58px] h-full flex items-center justify-center shrink-0">
        <Link
          to="/"
          data-no-window-drag
          title="Liner"
          className="flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        >
          <img
            src={logo}
            alt="Liner"
            width={39}
            height={30}
            className="h-[30px] w-auto object-contain theme-logo invert dark:invert-0 select-none"
            draggable={false}
          />
        </Link>
      </div>

      {!isMobile && (
        <div className="flex items-center gap-[8px] mr-[6px] shrink-0">
          <div
            data-no-window-drag
            data-no-tooltip="true"
            className="h-[38px] flex items-center gap-[2px] px-[4px] rounded-[10px] shrink-0 bg-bg-glass backdrop-blur-[20px]"
          >
            <WindowControls bare />
          </div>
        </div>
      )}
    </header>
  );
});

export default memo(Header);
