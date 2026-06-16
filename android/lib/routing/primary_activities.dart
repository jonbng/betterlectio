import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:betterlectio/routing/menu.dart';
import 'package:betterlectio/topics/absence/screens/absence_screen.dart';
import 'package:betterlectio/topics/calendar/screens/schema.dart';
import 'package:betterlectio/widgets/layout/bottombar.dart';
import 'package:betterlectio/widgets/layout/drawer.dart';

import '../topics/homework/screens/homework.dart';

class PrimaryActivities extends StatefulWidget {
  const PrimaryActivities({super.key, required this.navKey});
  final GlobalKey<NavigatorState> navKey;
  @override
  State<PrimaryActivities> createState() => _PrimaryActivitiesState();
}

class _PrimaryActivitiesState extends State<PrimaryActivities> {
  late PageController _controller;

  @override
  void initState() {
    _controller = PageController();
    super.initState();
  }

  int _selectedScreen = 0;
  final List<Destination> bottomDestinations = [
    Destination(
        icon: EvaIcons.calendarOutline,
        selectedIcon: EvaIcons.calendar,
        name: "Skema",
        screen: const SchemaScreen()),
    Destination(
        icon: EvaIcons.bookOpenOutline,
        name: "Lektier",
        selectedIcon: EvaIcons.bookOpen,
        screen: const HomeworkScreen()),
    Destination(
        icon: EvaIcons.activityOutline,
        name: "Fravær",
        selectedIcon: EvaIcons.activity,
        screen: const AbsenceScreen()),
    Destination(
        icon: EvaIcons.menu,
        name: "Mere",
        selectedIcon: EvaIcons.menu,
        screen: Menu())
  ];
  void reset() {
    widget.navKey.currentState!.popUntil((route) => route.isFirst);
  }

  void setScreen(int n) {
    reset();

    if (_selectedScreen == n) {
      return;
    }
    setState(() {
      _selectedScreen = n;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
        bottomNavigationBar: LppBottombar(
            onSelected: setScreen,
            selectedIndex: _selectedScreen,
            destinations: bottomDestinations),
        body: bottomDestinations.elementAt(_selectedScreen).screen);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
