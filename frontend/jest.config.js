/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "babel-jest",
      {
        presets: [
          ["@babel/preset-env", { targets: { node: "current" } }],
          ["@babel/preset-react", { runtime: "automatic" }],
          "@babel/preset-typescript",
        ],
      },
    ],
  },
  moduleNameMapper: {
    // Resolve the @/ path alias from tsconfig
    "^@/(.*)$": "<rootDir>/$1",
    // Stub out CSS imports
    "\\.css$": "<rootDir>/__mocks__/styleMock.js",
  },
  transformIgnorePatterns: ["/node_modules/"],
};

module.exports = config;
