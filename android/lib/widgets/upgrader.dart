import 'dart:io';

import 'package:flutter/material.dart';
import 'package:upgrader/upgrader.dart';

class LppUpgrader extends StatelessWidget {
const LppUpgrader({super.key, required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    return UpgradeAlert(
      
      showIgnore: false,
      showReleaseNotes: true,
      dialogStyle: Platform.isIOS ? UpgradeDialogStyle.cupertino : UpgradeDialogStyle.material,
      child: child,
    );
  }
}