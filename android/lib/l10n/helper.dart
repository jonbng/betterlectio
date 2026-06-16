import 'package:flutter/material.dart';
import 'package:betterlectio/l10n/app_localizations.dart';

extension IntlHelper on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}