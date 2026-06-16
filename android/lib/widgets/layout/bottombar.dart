import 'package:flutter/material.dart';
import 'package:betterlectio/widgets/layout/drawer.dart';

class LppBottombar extends StatelessWidget {
  const LppBottombar(
      {super.key,
      required this.destinations,
      required this.onSelected,
      required this.selectedIndex});
  final List<Destination> destinations;
  final Function(int n) onSelected;
  final int selectedIndex;
  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return NavigationBar(
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        backgroundColor: colorScheme.surface,
        indicatorColor: colorScheme.primaryContainer,
        selectedIndex: selectedIndex,
        onDestinationSelected: onSelected,
        destinations: destinations
            .map((e) => NavigationDestination(
                  icon: Icon(e.icon),
                  label: e.name,
                  selectedIcon: Icon(e.selectedIcon),
                ))
            .toList());
  }
}
