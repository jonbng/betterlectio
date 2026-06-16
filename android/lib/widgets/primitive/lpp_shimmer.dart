import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

class LppShimmer extends StatelessWidget {
  const LppShimmer({super.key, required this.child, required this.enabled});
  final Widget child;
  final bool enabled;
  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    if (enabled) {
      return Shimmer.fromColors(
          baseColor: colorScheme.secondaryContainer,
          highlightColor: colorScheme.primary,
          child: child);
    }
    return child;
  }
}
