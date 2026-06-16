import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:betterlectio/topics/classes/screens/klasse_screen.dart';
import 'package:betterlectio/topics/grades/screens/grade.dart';
import 'package:betterlectio/topics/messages/screens/message_screen.dart';
import 'package:betterlectio/topics/opgaver/screens/opgave_screen_overview.dart';
import 'package:betterlectio/topics/people/screens/people_screen.dart';
import 'package:betterlectio/topics/plans/screens/overview.dart';
import 'package:betterlectio/topics/settings/screens/change_year.dart';
import 'package:betterlectio/topics/settings/screens/help_screen.dart';
import 'package:betterlectio/topics/settings/screens/notification_screen.dart';
import 'package:betterlectio/topics/settings/screens/settings_screen.dart';
import 'package:betterlectio/topics/teams/screens/module_statistics_overview.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/drawer.dart';


class Menu extends StatelessWidget {
  Menu({super.key});

  final List<Destination> destinations = [
    Destination(
        icon: EvaIcons.folderOutline,
        selectedIcon: EvaIcons.folder,
        name: "Klasser",
        screen: const KlasseScreen()),
    Destination(
        icon: EvaIcons.peopleOutline,
        name: "Personer",
        selectedIcon: EvaIcons.people,
        screen: const PeopleScreen()),
    Destination(
        icon: EvaIcons.archiveOutline,
        selectedIcon: EvaIcons.archive,
        name: "Opgaver",
        screen: const OpgaveScreenOverview()),
    Destination(
        icon: EvaIcons.bookmarkOutline,
        name: "Karakterer",
        selectedIcon: EvaIcons.bookmark,
        screen: const GradeScreen(),
        onlyFromEdge: true),
    Destination(
        icon: EvaIcons.fileTextOutline,
        name: "Studieplan",
        selectedIcon: EvaIcons.fileText,
        screen: const PlanOverview()),
    Destination(
        icon: EvaIcons.messageCircleOutline,
        name: "Beskeder",
        selectedIcon: EvaIcons.messageCircle,
        screen: const MessageScreen()),
    Destination(
        icon: EvaIcons.barChart2Outline,
        name: "Modulregnskab",
        selectedIcon: EvaIcons.barChart2,
        screen: const ModuleStatisticsOverview()),
  ];

  final List<Destination> relatedDestinations = [
    Destination(
      icon: EvaIcons.clockOutline,
      name: "Skift årgang",
      selectedIcon: EvaIcons.clock,
      screen: const ChangeYearScreen(),
      onTap: (context) {
        adSheet(const ChangeYearScreen(), context);
      },
    ),
    Destination(
      icon: EvaIcons.bellOutline,
      name: "Notifikationer",
      selectedIcon: EvaIcons.bell,
      screen: const NotificationScreen(),
      onTap: (context) {
        adSheet(const NotificationScreen(), context);
      },
    ),
    Destination(
        icon: EvaIcons.questionMark,
        name: "Hjælp",
        selectedIcon: EvaIcons.questionMark,
        screen: const HelpScreen()),
    Destination(
        icon: EvaIcons.settings2Outline,
        name: "Indstillinger",
        screen: const SettingsScreen(),
        selectedIcon: EvaIcons.settings2)
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: const LppAppbar(
          title: "Mere",
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: LppDrawer(
                  destinations: destinations,
                  relatedDestinations: relatedDestinations),
            ),
          ],
        ));
  }
}
