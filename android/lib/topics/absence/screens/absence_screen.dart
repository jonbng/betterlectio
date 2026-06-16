import 'package:flutter/material.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/tabbar.dart';
import 'absence_overview.dart';
import 'absence_registrations.dart';

class AbsenceScreen extends StatefulWidget {
  const AbsenceScreen({super.key});

  @override
  State<AbsenceScreen> createState() => _AbsenceScreenState();
}

class _AbsenceScreenState extends State<AbsenceScreen>
    with SingleTickerProviderStateMixin {
  final List<Widget> screens = [
    const AbsenceOverviewScreen(),
    const AbsenceRegistrationsScreen()
  ];

  late TabController tabController;

  @override
  void initState() {
    super.initState();
    tabController = TabController(length: 2, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: LppAppbar(
        title: "Fravær",
        bottom: LppTabBar(
            controller: tabController,
            tabs: const ["Oversigt", "Registreringer"]),
      ),
      body: TabBarView(controller: tabController, children: screens),
    );
  }

  @override
  void dispose() {
    tabController.dispose();
    super.dispose();
  }
}
