import js from "@eslint/js";
import tseslint from "typescript-eslint";

const simMessage = (what, where) => `${what} is non-deterministic or forbidden in sim. Use ${where}.`;
const banned = (name, where) => ({
  object: "Math",
  property: name,
  message: simMessage(`Math.${name}`, where),
});

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/out/**", "**/coverage/**", "**/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...["Date", "performance", "setTimeout", "setInterval"].map((name) => ({
          name,
          message: `${name} is forbidden in sim (wall-clock/time). Drive everything from the tick counter.`,
        })),
      ],
      "no-restricted-properties": [
        "error",
        banned("random", "sim/src/rng.ts"),
        ...["sin", "cos", "tan", "atan", "atan2", "asin", "acos", "exp", "log", "hypot"].map((n) =>
          banned(n, "sim/src/trig.ts"),
        ),
      ],
      "no-restricted-imports": [
        "error",
        { patterns: ["@babylonjs/*", "react", "react-dom", "zustand", "node:*"] },
      ],
    },
  },
);
