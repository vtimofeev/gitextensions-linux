import Aura from "@primevue/themes/aura";
import { definePreset, palette } from "@primevue/themes";
import { appColors } from "./colors";

const { light, dark } = appColors;

export const AppPreset = definePreset(Aura, {
  primitive: {
    borderRadius: {
      none: "0",
      xs: "4px",
      sm: "4px",
      md: "5px",
      lg: "6px",
      xl: "6px",
    },
  },
  semantic: {
    primary: palette(light.accent),
    colorScheme: {
      light: {
        primary: {
          color: "{primary.600}",
          contrastColor: "#ffffff",
          hoverColor: "{primary.700}",
          activeColor: "{primary.800}",
        },
        surface: {
          0: light.level200,
          50: light.level100,
          100: light.level100,
          200: light.border,
          300: light.inputBorder,
          400: light.inputBorder,
          500: light.still,
          600: light.secondaryText,
          700: light.secondaryText,
          800: light.primaryText,
          900: light.primaryText,
          950: light.primaryText,
        },
      },
      dark: {
        primary: {
          color: "{primary.400}",
          contrastColor: dark.level100,
          hoverColor: "{primary.300}",
          activeColor: "{primary.200}",
        },
        surface: {
          0: dark.primaryText,
          50: dark.secondaryText,
          100: dark.secondaryText,
          200: dark.still,
          300: dark.still,
          400: dark.still,
          500: dark.inputBorder,
          600: dark.border,
          700: dark.level300,
          800: dark.level200,
          900: dark.level100,
          950: dark.level100,
        },
      },
    },
  },
});
