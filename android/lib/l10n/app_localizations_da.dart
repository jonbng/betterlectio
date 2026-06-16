// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Danish (`da`).
class AppLocalizationsDa extends AppLocalizations {
  AppLocalizationsDa([String locale = 'da']) : super(locale);

  @override
  String get welcome_greeting_title => 'Lectio ved dine fingerspidser';

  @override
  String get welcome_greeting_description =>
      'En lækker Lectio-app, som alle har adgang til.';

  @override
  String get welcome_greeting_button => 'Gå i gang';

  @override
  String get welcome_theme_title => 'Skræddersyet til dig';

  @override
  String get welcome_theme_description =>
      'Lad os få appen til at passe til dig.';

  @override
  String get welcome_theme_chose_theme => 'Vælg tema';

  @override
  String get welcome_theme_next => 'Videre';

  @override
  String get welcome_gym_title => 'Næsten færdig';

  @override
  String get welcome_gym_description =>
      'For at du kan fortsætte, skal du vælge dit gymnasie.';

  @override
  String get welcome_gym_button => 'Vælg';
}
