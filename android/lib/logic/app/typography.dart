import 'package:flutter/material.dart';

class BlTypography {
  static TextStyle? bodySmall(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return Theme.of(context)
        .textTheme
        .bodySmall
        ?.copyWith(color: colorScheme.onSurface, fontSize: 12, height: 4 / 3);
  }

  static TextStyle? headlineSmall(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return Theme.of(context).textTheme.headlineSmall?.copyWith(
        fontFamily: 'Fraunces',
        color: colorScheme.onSurface,
        fontVariations: [
          const FontVariation("soft", 100.0),
          const FontVariation("wonk", 1.0),
          const FontVariation('wght', 600)
        ],
        fontSize: 24.0,
        height: 4 / 3);
  }

  static TextStyle? labelSmall(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return Theme.of(context).textTheme.labelSmall?.copyWith(
        color: colorScheme.onSurface,
        fontSize: 18.0,
        fontFamily: 'Fraunces',
        fontVariations: [
          const FontVariation("soft", 100.0),
          const FontVariation("wonk", 1.0),
          const FontVariation('wght', 400)
        ],
        fontWeight: FontWeight.w500,
        height: 4 / 3);
  }
}
