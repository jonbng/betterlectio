import 'dart:io';

import 'package:flutter/material.dart';
import 'package:page_transition/page_transition.dart';

Route adRoute(Widget screen, {bool onlyFromEdge = false, bool noAd = false}) {
  return PageTransition(
      curve: Curves.easeInCubic,
      child: SafeArea(
          top: false,
          right: false,
          left: false,
          child: screen),
      type: PageTransitionType.fade,
      isIos: Platform.isIOS);
}

void adSheet(Widget sheet, BuildContext context,
    {bool ad = true, bool skipColumn = false}) {
  showModalBottomSheet(
    showDragHandle: true,
    useSafeArea: true,
    clipBehavior: Clip.hardEdge,
    isScrollControlled: true,
    context: context,
    builder: (context) {
      if (skipColumn) {
        return sheet;
      }
      return Column(mainAxisSize: MainAxisSize.min, children: [
        sheet,
      ]);
    },
  );
}
