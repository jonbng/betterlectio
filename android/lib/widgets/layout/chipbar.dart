import 'package:flutter/material.dart';

class Chipbar extends StatelessWidget implements PreferredSizeWidget {
  const Chipbar(
      {super.key,
      required this.filters,
      required this.appliedFilters,
      required this.apply});
  final List<String> filters;
  final Set<String> appliedFilters;
  final Function(String filter) apply;
  @override
  Widget build(BuildContext context) {
    return Container(
      color: Theme.of(context).colorScheme.primary,
      height: preferredSize.height,
      width: preferredSize.width,
      child: Center(
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: filters
              .map((filter) => Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6.0),
                    child: FilterChip(
                      label: Text(filter),
                      selected: appliedFilters.contains(filter),
                      onSelected: (value) {
                        apply(filter);
                      },
                    ),
                  ))
              .toList(),
        ),
      ),
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}
