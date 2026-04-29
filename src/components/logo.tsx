import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  iconSize?: number;
  compact?: boolean;
}

export function Logo({ className, compact }: LogoProps) {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image 
        src="/logo.png" 
        alt="That Laundry Shop Logo" 
        width={400} 
        height={250} 
        className={cn("w-auto object-contain drop-shadow-sm", className || (compact ? "h-8" : "h-14"))}
        priority
      />
    </Link>
  );
}
