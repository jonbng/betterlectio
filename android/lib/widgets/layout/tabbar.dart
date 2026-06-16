import 'package:flutter/material.dart';

class LppTabBar extends StatelessWidget implements PreferredSizeWidget {
  final List<String> tabs;

  const LppTabBar(
      {super.key,
      required this.tabs,
      this.controller,
      this.scrollable = false});

  final TabController? controller;
  final bool scrollable;
  @override
  Widget build(BuildContext context) {
    return Container(
      color: null, //theme.colorScheme.primary,
      child: TabBar(
          isScrollable: scrollable,
          controller: controller,
          /* labelColor: iconAndTextColor,
          unselectedLabelColor: iconAndTextColor?.withOpacity(0.8),
          indicatorColor: iconAndTextColor,*/
          tabs: tabs
              .map((e) => Tab(
                    text: e,
                  ))
              .toList()),
    );
  }

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);
}
