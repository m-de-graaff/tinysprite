# Contributing to TinySprites

Thank you for your interest in contributing to TinySprites! This document provides guidelines and information for contributors.

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn package manager
- Git

### Setting Up the Development Environment

1. **Fork the repository**

   ```bash
   git clone https://github.com/m-de-graaff/tinysprites.git
   cd tinysprites
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run tests to ensure everything is working**
   ```bash
   npm test
   ```

## Development Workflow

### 1. Create a Feature Branch

Always create a new branch for your changes:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make Your Changes

- Follow the existing code style and conventions
- Write clear, descriptive commit messages
- Include tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test files
npm test -- --grep "encoder"

# Check code coverage
npm run test:coverage
```

### 4. Commit Your Changes

Use conventional commit format:

```bash
git commit -m "feat: add new compression algorithm"
git commit -m "fix: resolve memory leak in decoder"
git commit -m "docs: update API documentation"
```

### 5. Push and Create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub with:

- Clear description of changes
- Reference to any related issues
- Screenshots for UI changes
- Performance impact analysis if applicable

## Code Style Guidelines

### JavaScript/TypeScript

- Use ES6+ features
- Prefer `const` and `let` over `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Use destructuring when appropriate

```javascript
// Good
const { width, height } = options;
const pixels = new Uint8Array(width * height);

// Avoid
var pixels = new Uint8Array(options.width * options.height);
```

### Naming Conventions

- **Variables and functions**: camelCase
- **Constants**: UPPER_SNAKE_CASE
- **Classes**: PascalCase
- **Files**: kebab-case

```javascript
// Good
const maxColorDepth = 8;
const getPixelColor = (x, y) => {
  /* ... */
};
class TinySprite {
  /* ... */
}

// Avoid
const max_color_depth = 8;
const get_pixel_color = (x, y) => {
  /* ... */
};
class tiny_sprite {
  /* ... */
}
```

### Error Handling

- Use descriptive error messages
- Include context information
- Use custom error classes for specific error types

```javascript
class TinySpriteError extends Error {
  constructor(message, code, context = {}) {
    super(message);
    this.name = "TinySpriteError";
    this.code = code;
    this.context = context;
  }
}

throw new TinySpriteError(
  "Invalid color mode specified",
  "INVALID_COLOR_MODE",
  { colorMode, allowedModes: ["TSV8", "RGB332", "PAL12", "RGB888"] }
);
```

## Testing Guidelines

### Test Structure

- Test files should mirror the source file structure
- Use descriptive test names
- Group related tests with `describe` blocks
- Test both success and failure cases

```javascript
describe("TinySprite", () => {
  describe("constructor", () => {
    it("should create sprite with valid dimensions", () => {
      const sprite = new TinySprite(16, 16);
      expect(sprite.width).toBe(16);
      expect(sprite.height).toBe(16);
    });

    it("should throw error for invalid dimensions", () => {
      expect(() => new TinySprite(-1, 16)).toThrow();
      expect(() => new TinySprite(16, 0)).toThrow();
    });
  });

  describe("setPixel", () => {
    it("should set pixel at valid coordinates", () => {
      const sprite = new TinySprite(16, 16);
      sprite.setPixel(0, 0, 0xff0000);
      expect(sprite.getPixel(0, 0)).toBe(0xff0000);
    });

    it("should throw error for out-of-bounds coordinates", () => {
      const sprite = new TinySprite(16, 16);
      expect(() => sprite.setPixel(16, 0, 0xff0000)).toThrow();
      expect(() => sprite.setPixel(0, 16, 0xff0000)).toThrow();
    });
  });
});
```

### Performance Testing

- Include benchmarks for critical functions
- Test with various input sizes
- Monitor memory usage
- Compare against baseline performance

```javascript
describe("Performance", () => {
  it("should encode 32x32 sprite in under 1ms", () => {
    const sprite = createTestSprite(32, 32);
    const start = performance.now();
    sprite.encode();
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(1);
  });

  it("should decode 32x32 sprite in under 0.5ms", () => {
    const encoded = createTestSprite(32, 32).encode();
    const start = performance.now();
    TinySprite.decode(encoded);
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(0.5);
  });
});
```

## Documentation Guidelines

### Code Comments

- Use JSDoc for public APIs
- Explain complex algorithms
- Include usage examples
- Document performance characteristics

```javascript
/**
 * Encodes the sprite to TinySprites format.
 *
 * @param {Object} options - Encoding options
 * @param {string} [options.format='buffer'] - Output format ('buffer', 'base64', 'hex')
 * @param {number} [options.quality=100] - Compression quality (0-100)
 * @returns {Buffer|string} Encoded sprite data
 *
 * @example
 * const encoded = sprite.encode({ format: 'base64' });
 * const buffer = sprite.encode({ format: 'buffer' });
 *
 * @performance
 * - Time complexity: O(n) where n is the number of pixels
 * - Space complexity: O(n) for the output buffer
 * - Typical compression ratio: 10-50% of original size
 */
encode(options = {}) {
    // Implementation...
}
```

### README Updates

- Update README.md for user-facing changes
- Update SPECIFICATION.md for format changes
- Update API.md for interface changes
- Include examples for new features

## Areas for Contribution

### High Priority

- **Performance improvements**: Optimize encoding/decoding algorithms
- **Memory optimization**: Reduce memory usage in large sprites
- **Error handling**: Improve error messages and recovery
- **Testing**: Increase test coverage and add edge case tests

### Medium Priority

- **Language bindings**: Python, Rust, C++, etc.
- **Tooling**: CLI tools, GUI applications, browser extensions
- **Documentation**: Tutorials, performance guides, best practices
- **Examples**: More use cases and sample projects

### Low Priority

- **Format extensions**: Additional color modes, compression profiles
- **Utilities**: Image processing tools, format converters
- **Integration**: Webpack plugins, build tools, etc.

## Review Process

### Pull Request Requirements

- All tests must pass
- Code coverage should not decrease
- Documentation must be updated
- Performance impact must be documented
- Breaking changes require major version bump

### Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests are comprehensive
- [ ] Documentation is updated
- [ ] Performance impact is acceptable
- [ ] No breaking changes (or properly documented)
- [ ] Commit messages are clear

## Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **Major**: Breaking changes
- **Minor**: New features, backward compatible
- **Patch**: Bug fixes, backward compatible

### Release Checklist

- [ ] All tests pass
- [ ] Documentation is updated
- [ ] CHANGELOG.md is updated
- [ ] Version is bumped in package.json
- [ ] Release notes are written
- [ ] GitHub release is created

## Getting Help

### Communication Channels

- **Issues**: Use GitHub issues for bugs and feature requests
- **Discussions**: Use GitHub discussions for questions and ideas
- **Code review**: Ask questions in pull request comments

### Resources

- [Technical Specification](SPECIFICATION.md)
- [API Reference](API.md)
- [Examples](EXAMPLES.md)
- [GitHub repository](https://github.com/m-de-graaff/tinysprites)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please:

- Be respectful and considerate
- Focus on the code and technical issues
- Welcome newcomers and help them learn
- Report any inappropriate behavior

## License

By contributing to TinySprites, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to TinySprites! Your contributions help make this project better for everyone.
