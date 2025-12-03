// src/lib/canvasConfig.js

export const baseCanvas = {
  width: 260,
  aspectRatio: "1 / 2.12",
  borderColor: "2px solid rgba(168, 85, 247, 0.9)",
};

export const textVariants = {
  big: "font-serif leading-none tracking-wide md:text-[36px]",
  normal: "font-serif italic text-lg",
  small: "text-[10px] font-semibold uppercase tracking-[0.45em]",
  bold: "text-4xl font-extrabold tracking-[0.3em]",
};

export const fontFamilies = [
  { label: "Homemade Apple", value: "Homemade Apple, cursive" },
  { label: "Dancing Script", value: "Dancing Script, cursive" },
  { label: "Playfair Display", value: "Playfair Display, serif" },
  { label: "League Spartan", value: "League Spartan, sans-serif" },
  { label: "Archivo Black", value: "Archivo Black, sans-serif" },
  { label: "Aileron", value: "Aileron, sans-serif" },
  { label: "Rowdies", value: "Rowdies, cursive" },
  { label: "Sacramento", value: "Sacramento, cursive" },
  { label: "Akronim", value: "Akronim, cursive" },
  { label: "Audiowide", value: "Audiowide, sans-serif" },

  // Variable fonts
  { label: "Ballet (Variable)", value: "Ballet Variable, cursive" },
  { label: "Dosis (Variable)", value: "Dosis Variable, sans-serif" },
  { label: "Montserrat (Variable)", value: "Montserrat Variable, sans-serif" },
  { label: "Oswald (Variable)", value: "Oswald Variable, sans-serif" },
  { label: "Tilt Prism (Variable)", value: "Tilt Prism Variable, cursive" },

  { label: "Bungee Outline", value: "Bungee Outline, cursive" },
  { label: "Bungee Shade", value: "Bungee Shade, cursive" },
  { label: "Butterfly Kids", value: "Butterfly Kids, cursive" },
  { label: "Cabin Sketch", value: "Cabin Sketch, cursive" },
  { label: "Chewy", value: "Chewy, cursive" },
  { label: "Codystar", value: "Codystar, cursive" },
  { label: "Creepster", value: "Creepster, cursive" },

  { label: "DotGothic16", value: "DotGothic16, sans-serif" },
  { label: "Faster One", value: "Faster One, cursive" },
  { label: "Graduate", value: "Graduate, serif" },
  { label: "Griffy", value: "Griffy, cursive" },
  { label: "Gruppo", value: "Gruppo, cursive" },
  { label: "Hanalei", value: "Hanalei, cursive" },
  { label: "Limelight", value: "Limelight, display" },
  { label: "Londrina Shadow", value: "Londrina Shadow, cursive" },
  { label: "Monoton", value: "Monoton, cursive" },
  { label: "Nosifer", value: "Nosifer, cursive" },

  { label: "Pinyon Script", value: "Pinyon Script, cursive" },
  { label: "Rampart One", value: "Rampart One, display" },
  { label: "Roboto", value: "Roboto, sans-serif" },

  { label: "Rubik Glitch", value: "Rubik Glitch, display" },
  { label: "Rubik Moonrocks", value: "Rubik Moonrocks, display" },
  { label: "Rubik Wet Paint", value: "Rubik Wet Paint, display" },

  { label: "Silkscreen", value: "Silkscreen, sans-serif" },
  { label: "Tangerine", value: "Tangerine, cursive" },

  { label: "Train One", value: "Train One, cursive" },
  { label: "Vast Shadow", value: "Vast Shadow, display" },

  // Extra fonts imported via other packages
  { label: "Loved by the King", value: "Loved by the King, cursive" },
  { label: "Lovers Quarrel", value: "Lovers Quarrel, cursive" },
];

export const cornerHandles = [
  {
    id: "top-left",
    className: "-left-2 -top-2 cursor-nwse-resize",
    interaction: "resize",
  },
  {
    id: "top-right",
    className: "-right-2 -top-2 cursor-nesw-resize",
    interaction: "resize",
  },
  {
    id: "bottom-left",
    className: "-left-2 -bottom-2 cursor-nesw-resize",
    interaction: "resize",
  },
  {
    id: "bottom-right",
    className: "-right-2 -bottom-2 cursor-nwse-resize",
    interaction: "resize",
  },
];

export const imageSideHandles = [
  {
    id: "left",
    className: "-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
    interaction: "crop",
  },
  {
    id: "right",
    className: "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize",
    interaction: "crop",
  },
  {
    id: "top",
    className: "-top-2 left-1/2 -translate-x-1/2 cursor-ns-resize",
    interaction: "crop",
  },
  {
    id: "bottom",
    className: "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize",
    interaction: "crop",
  },
];

export const textSideHandles = imageSideHandles.map((h) => ({
  ...h,
  interaction: "resize",
}));

export const textHorizontalHandles = textSideHandles.filter(
  (h) => h.id === "left" || h.id === "right"
);

export const clampCropValue = (value, min = 0, max = 45) =>
  Math.min(Math.max(value, min), max);

export const getCropValues = (crop = {}) => ({
  top: crop.top ?? 0,
  right: crop.right ?? 0,
  bottom: crop.bottom ?? 0,
  left: crop.left ?? 0,
});

export const hasNumericSize = (block) => {
  if (block.type === "text") {
    return typeof block.size?.width === "number";
  }
  return (
    typeof block.size?.width === "number" &&
    typeof block.size?.height === "number"
  );
};

//**
//  * Build inline style for each block (position, size, rotation, zIndex)
//  * position.x / position.y are in px relative to canvas.
//  */
export const buildBlockStyle = (block) => {
  const style = {};

  if (typeof block.position?.x === "number") {
    style.left = `${block.position.x}px`;
  }

  if (typeof block.position?.y === "number") {
    style.top = `${block.position.y}px`;
  }

  if (typeof block.opacity === "number") {
    style.opacity = block.opacity;
  }

  if (typeof block.borderRadius === "number") {
    style.borderRadius = `${block.borderRadius}px`;
  }

  if (block.size?.width) {
    style.width =
      typeof block.size.width === "number"
        ? `${block.size.width}px`
        : block.size.width;
  }

  // For text, let height be auto based on content
  if (block.type !== "text" && block.size?.height) {
    style.height =
      typeof block.size.height === "number"
        ? `${block.size.height}px`
        : block.size.height;
  }

  if (typeof block.color === "string" && block.color.trim() !== "") {
    style.color = block.color;
  } else if (
    typeof block.textColor === "string" &&
    block.textColor.trim() !== ""
  ) {
    style.color = block.textColor;
  }

  // APPLY BACKGROUND (new)
  // Accepts values like "#fff", "rgba(0,0,0,0.5)", "linear-gradient(...)" or image urls
  if (typeof block.background === "string" && block.background.trim() !== "") {
    // If user supplied a CSS background shorthand (gradient, image), use it directly.
    style.background = block.background;
  } else if (
    typeof block.backgroundColor === "string" &&
    block.backgroundColor.trim() !== ""
  ) {
    // alternative field name if you prefer `backgroundColor`
    style.backgroundColor = block.backgroundColor;
  }

  // For text blocks, ensure padding/boxSizing so background looks good.
  if (block.type === "text") {
    // ensure the block's padding is included in width/height
    style.boxSizing = "border-box";
    // Optional: apply default padding if none specified so background doesn't hug text tightly.
    // Remove or change the values if you already manage padding elsewhere.
    if (typeof block.padding === "number") {
      style.padding = `${block.padding}px`;
    } else {
      // small default padding for text boxes with background
      if (block.background || block.backgroundColor) {
        style.padding = "6px 8px";
      }
    }
  }

  const transforms = [];
  if (typeof block.rotation === "number") {
    transforms.push(`rotate(${block.rotation}deg)`);
  }
  if (block.flipH) transforms.push("scaleX(-1)");
  if (block.flipV) transforms.push("scaleY(-1)");

  if (transforms.length > 0) {
    style.transform = transforms.join(" ");
    style.transformOrigin = "center";
  }

  if (typeof block.zIndex === "number") {
    style.zIndex = block.zIndex;
  }

  return style;
};
