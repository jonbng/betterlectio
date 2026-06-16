import 'package:flutter/material.dart';
import 'package:betterlectio/topics/classes/screens/classes_overview_screen.dart';
import 'package:betterlectio/topics/classes/screens/teams_overview.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/tabbar.dart';

class KlasseScreen extends StatelessWidget {
  const KlasseScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: LppAppbar(
          title: "Klasser",
          bottom: LppTabBar(tabs: [
            "Klasser",
            "Mine hold",
          ]),
        ),
        body: TabBarView(
            children: [ClassesOverviewScreen(), TeamsOverviewScreen()]),
      ),
    );
  }
}
