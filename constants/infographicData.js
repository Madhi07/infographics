const infographicData = {
  id: "9284hstev25433",
  pages: [
    {
      id: "page_1",
      title: "page_1",
      blocks: [
        {
          id: "title-script",
          type: "text",
          variant: "big",
          content: "Amazing",
          position: { x: 12, y: 5 },
          size: { width: "76%" },
          color: "#0c33df",
          fontFamily: "Playfair Display, serif",
          fontSize: 36,
          zIndex: 10
        },
        {
          id: "subtitle",
          type: "text",
          variant: "small",
          content: "CONTEMPORARY EDIT",
          subline: "Wardrobe refresh · Summer drop",
          position: { x: 12, y: 13 },
          size: { width: "76%" },
          color: "#222222",
          fontFamily: "Roboto, system-ui, -apple-system",
          fontSize: 10,
          zIndex: 9
        },
        {
          id: "divider",
          type: "line",
          size: { width: "76%" },
          position: { x: 12, y: 20 },
          color: "#e6e6e6",
          zIndex: 8
        },
        {
          id: "palette",
          type: "palette",
          colors: ["#c9b6a4", "#e0cdbf", "#dbc2ae", "#e2d2c4", "#b79c87"],
          position: { x: 20, y: 23 },
          zIndex: 7
        },
        {
          id: "new-label-one",
          type: "text",
          variant: "bold",
          content: "NEW",
          position: { x: 70, y: 10 },
          color: "#ffffff",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 24,
          background: "#ff3b30", // optional background for label look
          zIndex: 11
        },
        {
          id: "new-label-two",
          type: "text",
          variant: "bold",
          content: "NEW",
          position: { x: 10, y: 42 },
          color: "#000000",
          fontFamily: "Montserrat, sans-serif",
          fontSize: 24,
          background: "#ffd166",
          zIndex: 6
        },
        {
          id: "tagline-script",
          type: "text",
          variant: "normal",
          content: "capsule muse",
          position: { x: 56, y: 47 },
          color: "#6b6b6b",
          fontFamily: "Dancing Script, cursive",
          fontSize: 18,
          zIndex: 6
        },
        {
          id: "hero-main",
          type: "image",
          src: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80",
          alt: "Hero model seated on chair",
          size: { width: 180, height: 127 }, // px
          position: { x: 15, y: 30 },
          rotation: -20,
          zIndex: 4
        },
        {
          id: "frame-top-left",
          type: "image",
          src: "https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=600&q=80",
          alt: "Model top left",
          size: { width: 90, height: 120 },
          position: { x: 5, y: 8 },
          rotation: -6,
          zIndex: 3
        },
        {
          id: "frame-top-right",
          type: "image",
          src: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80",
          alt: "Model top right",
          size: { width: 90, height: 120 },
          position: { x: 62, y: 25 },
          rotation: 8,
          zIndex: 3
        },
        {
          id: "frame-mid-left",
          type: "image",
          src: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=600&q=80",
          alt: "Mid collage",
          size: { width: 90, height: 130 },
          position: { x: 8, y: 46 },
          rotation: -8,
          zIndex: 2
        },
        {
          id: "frame-mid-right",
          type: "image",
          src: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=600&q=80",
          alt: "Mid right collage",
          size: { width: 90, height: 130 },
          position: { x: 64, y: 44 },
          rotation: 5,
          zIndex: 2
        },
        {
          id: "frame-bottom-left",
          type: "image",
          src: "https://images.unsplash.com/photo-1502164980785-f8aa41d53611?auto=format&fit=crop&w=600&q=80",
          alt: "Bottom left collage",
          size: { width: 90, height: 120 },
          position: { x: 18, y: 62 },
          rotation: 7,
          zIndex: 2
        },
        {
          id: "frame-bottom-right",
          type: "image",
          src: "https://images.unsplash.com/photo-1504595403659-9088ce801e29?auto=format&fit=crop&w=600&q=80",
          alt: "Bottom right collage",
          size: { width: 90, height: 120 },
          position: { x: 58, y: 64 },
          rotation: -4,
          zIndex: 2
        },
        {
          id: "footer-text",
          type: "text",
          variant: "small",
          content: "journal 09 · street stories",
          position: { x: 20, y: 91 },
          color: "#444444",
          fontFamily: "Roboto, system-ui, -apple-system",
          fontSize: 10,
          zIndex: 1
        }
      ]
    },
    {
      id: "page_2",
      title: "page_2",
      blocks: [
      ]
    }
  ],

  activePageId: "page_1"
};

export default infographicData;
