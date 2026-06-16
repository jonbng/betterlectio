import 'package:aura_box/aura_box.dart';
import 'package:flutter/material.dart';

class AdFreeArt extends StatelessWidget {
  const AdFreeArt({super.key, required this.child, this.scale = 1});
  final Widget child;
  final double scale;
  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return AuraBox(spots: [
      AuraSpot(
          color: colorScheme.primary,
          radius: 125.0 * scale,
          alignment: Alignment.centerRight),
      AuraSpot(
          color: colorScheme.tertiary,
          radius: 150.0 * scale,
          alignment: Alignment.topLeft),
      AuraSpot(
          color: colorScheme.secondary,
          radius: 175.0 * scale,
          alignment: Alignment.center)
    ], child: child);
  }
}