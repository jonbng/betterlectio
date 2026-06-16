import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';

class BlAppbar extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final Widget? titleWidget;
  final bool hideMenu;
  final bool hideLeading;
  final List<Widget>? actions;
  final PreferredSizeWidget? bottom;
  final bool noStyle;
  const BlAppbar({
    super.key,
    required this.title,
    this.titleWidget,
    this.hideMenu = false,
    this.actions,
    this.bottom,
    this.noStyle = false,
    this.hideLeading = false,
  });

  @override
  Widget build(BuildContext context) {
    return AppBar(
      titleTextStyle: BlTypography.headlineSmall(context)
              ?.copyWith(overflow: TextOverflow.ellipsis) ??
          const TextStyle(),
      bottom: bottom,
      centerTitle: false,
      elevation: 0.0,
      automaticallyImplyLeading: !hideLeading,
      title: titleWidget ??
          Text(
            title,
          ),
      actions: actions,
    );
  }

  @override
  Size get preferredSize => bottom != null
      ? Size.fromHeight(bottom!.preferredSize.height + kToolbarHeight)
      : const Size.fromHeight(kTextTabBarHeight);
}
