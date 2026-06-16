import 'package:flutter/material.dart';
import 'package:betterlectio/routing/primary_activities.dart';


import 'lectio_provider.dart';

class RootController extends StatefulWidget {
  const RootController({super.key});

  @override
  State<RootController> createState() => _RootControllerState();
}

class _RootControllerState extends State<RootController> {
  final GlobalKey<NavigatorState> _navKey = GlobalKey();

  @override
  void initState() {
    super.initState();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body:  LectioProvider(
          child: NavigatorPopHandler(
            onPopWithResult: (result) => _navKey.currentState?.pop(),
            child: Navigator(
              key: _navKey,
              observers: [
                HeroController(),
              ],
              onGenerateRoute: (settings) {
                return MaterialPageRoute(
                  builder: (context) {
                    return PrimaryActivities(navKey: _navKey);
                  },
                );
              },
              pages: const [],
            ),
          ),
        ),
      
    );
  }

  @override
  void dispose() {
    super.dispose();
  }
}
