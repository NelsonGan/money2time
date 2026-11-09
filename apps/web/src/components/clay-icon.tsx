import Image from "next/image";

import type { CategoryIconName, ClayIconName } from "@/lib/icons.generated";
import { media } from "@/lib/media";

type Props = {
  size?: number;
  className?: string;
  /** Set when the icon carries meaning on its own. */
  alt?: string;
};

/**
 * A clay icon from the app's icon set. Artwork is 128x128, so anything up to
 * ~64px on screen stays crisp on retina.
 */
export function ClayIcon({
  name,
  size = 40,
  className = "",
  alt = "",
}: Props & { name: ClayIconName }) {
  return (
    <Image
      src={media(`/clay-icons/${name}.png`)}
      alt={alt}
      width={128}
      height={128}
      className={`block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

/** An icon from the app's default category pack (coffee, groceries, rent…). */
export function CategoryIcon({
  name,
  size = 28,
  className = "",
  alt = "",
}: Props & { name: CategoryIconName }) {
  return (
    <Image
      src={media(`/category-icons/${name}.png`)}
      alt={alt}
      width={128}
      height={128}
      className={`block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
