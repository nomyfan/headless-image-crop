import presetUno from "@unocss/preset-uno";
import transformerVariantGroup from "@unocss/transformer-variant-group";
import { defineConfig } from "unocss";

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  presets: [presetUno()],
  transformers: [transformerVariantGroup()],
  shortcuts: {
    "flex-center": "flex items-center justify-center",
    "absolute-center":
      "absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2",
  },
});
