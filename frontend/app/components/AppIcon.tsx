"use client";

import {
  Archive,
  ArrowLeft,
  Camera,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  DownloadSimple,
  FileArrowDown,
  FileText,
  Gauge,
  Gear,
  MagnifyingGlass,
  Microphone,
  Package,
  Paperclip,
  Pulse,
  Toolbox,
  Warning,
  Wrench,
  X,
} from "@phosphor-icons/react";
import type { ComponentProps } from "react";

const icons = {
  archive: Archive,
  back: ArrowLeft,
  camera: Camera,
  chart: ChartLineUp,
  check: CheckCircle,
  clipboard: ClipboardText,
  download: DownloadSimple,
  fileDownload: FileArrowDown,
  file: FileText,
  gauge: Gauge,
  gear: Gear,
  search: MagnifyingGlass,
  microphone: Microphone,
  package: Package,
  paperclip: Paperclip,
  pulse: Pulse,
  toolbox: Toolbox,
  warning: Warning,
  wrench: Wrench,
  close: X,
} as const;

export type AppIconName = keyof typeof icons;

type AppIconProps = {
  name: AppIconName;
  size?: number;
} & Omit<ComponentProps<typeof Wrench>, "size" | "children">;

export default function AppIcon({ name, size = 20, className, ...props }: AppIconProps) {
  const Icon = icons[name];
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      size={size}
      weight="regular"
      className={`shrink-0 ${className ?? ""}`}
      {...props}
    />
  );
}
