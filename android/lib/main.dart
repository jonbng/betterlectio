import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/l10n/app_localizations.dart';
import 'package:betterlectio/notifications/notification.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/widgets/upgrader.dart';
import 'package:workmanager/workmanager.dart';
import 'constants.dart';
import 'logic/app/settings.dart';
import 'logic/student/student_bloc.dart';
import 'routing/router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  Workmanager().initialize(callbackDispatcher);

  registerPeriodicTask();

  runApp(const LectioBase());
}


class LectioBase extends StatelessWidget {
  const LectioBase({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(
          create: (_) => SettingsBloc()..add(CheckForTheme()),
        ),
        BlocProvider(create: (_) => LoginBloc()),
        BlocProvider(create: (_) => StudentBloc()..add(LaunchedApp()))
      ],
      child: const LectioApp(),
    );
  }
}

class LectioApp extends StatelessWidget {
  const LectioApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SettingsBloc, SettingsState>(builder: (context, state) {
      var theme = state.theme;
      return MaterialApp(
        builder: (context, child) {
          return MediaQuery(
              data:
                  MediaQuery.of(context).copyWith(alwaysUse24HourFormat: true),
              child: child ?? Container());
        },
        navigatorObservers: [HeroController()],
        debugShowCheckedModeBanner: false,
        localizationsDelegates:
          AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        locale: const Locale(
          'da',
        ),
        title: appName,
        theme: theme,
        home: const LppUpgrader(child:  AppRouter()),
      );
    });
  }
}
