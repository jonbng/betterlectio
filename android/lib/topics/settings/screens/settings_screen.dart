import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import 'package:betterlectio/topics/settings/bloc/term_bloc.dart';
import 'package:betterlectio/topics/settings/screens/notification_history_screen.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/text_divider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../logic/app/settings.dart';
import '../../../logic/student/student_bloc.dart';
import '../../welcome/screens/theming/theme_controller.dart';
import 'package:package_info_plus/package_info_plus.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String appName = "";

  String version = "";

  String buildNumber = "";
  late TermBloc bloc;
  @override
  void initState() {
    super.initState();
    bloc = TermBloc(getStudentBloc(context).state.student!);
    PackageInfo.fromPlatform().then((PackageInfo packageInfo) {
      setState(() {
        appName = packageInfo.appName;
        version = packageInfo.version;
        buildNumber = packageInfo.buildNumber;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const LppAppbar(title: "Indstillinger"),
      body: BlocBuilder<SettingsBloc, SettingsState>(builder: (context, state) {
        return Column(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: ListView(
                children: [
                  const TextDivider(
                    text: "Generelt",
                    primary: true,
                  ),
                  ListTile(
                    title: Text("$version+$buildNumber"),
                    subtitle: const Text("Version"),
                  ),
                  ListTile(
                    onTap: () {
                      adSheet(ThemeController(), context);
                    },
                    title: const Text("Skift tema"),
                    subtitle: const Text("Tilpasning"),
                  ),
                 
                  ListTile(
                    title: const Text("Privatlivspolitik"),
                    subtitle: const Text("Læs privatlivspolitikken"),
                    onTap: () async {
                      var uri =
                          Uri.parse("https://betterlectio.dk/privatliv");
                      if (await canLaunchUrl(uri)) {
                        await launchUrl(uri,
                            mode: LaunchMode.externalApplication);
                      }
                    },
                  ),
                  ListTile(
                   
                    title: const Text("Hold cache"),
                    subtitle: const Text(
                        "Genopfrisk hold cachen, hvis holdnavne ikke dukker op automatisk"),
                    onTap: () {
                      context.read<StudentBloc>().add(RefreshTeams());
                    },
                  ),
                 
                  ListTile(
                    onTap: () {
                      Navigator.push(
                          context, adRoute(const NotificationHistoryScreen()));
                    },
                    title: const Text("Se notifikations historik"),
                    subtitle: const Text(
                        "Føler du ikke, at du får notifikationer? Se om den rent faktisk tjekker."),
                  )
                ],
              ),
            ),
            ListTile(
              textColor: Theme.of(context).colorScheme.onErrorContainer,
              tileColor: Theme.of(context).colorScheme.errorContainer,
              onTap: () {
                getStudentBloc(context).add(StudentLoggedOut());
              },
              trailing: const Icon(EvaIcons.logOut),
              title: const Text("Log ud"),
              subtitle: const Text("Fjerner alle dine data og logger dig ud"),
            ),
          ],
        );
      }),
    );
  }
}
