import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';

sealed class SettingsBlocEvent {}

final class SwitchedTheme extends SettingsBlocEvent {
  final Color color;
  final Brightness brightness;
  SwitchedTheme(this.color, this.brightness);
}

final class ToggleClass extends SettingsBlocEvent {}

final class CheckForTheme extends SettingsBlocEvent {}

final class ToggleNotifyEvents extends SettingsBlocEvent {}

const notifyEventsKey = "notifyEvents";
const notifyDebugKey = "notifyDebug";

/// BetterLectio brand color (oklch(0.54 0.2 265)).
const betterLectioPrimary = Color(0xFF3362E1);

final ThemeData rootTheme = ThemeData(
  brightness: Brightness.dark,
  useMaterial3: true,
  fontFamily: 'Inter',
  colorSchemeSeed: betterLectioPrimary,
);

class SettingsBloc extends Bloc<SettingsBlocEvent, SettingsState> {
  SettingsBloc()
      : super(SettingsState(
          betterLectioPrimary,
          Brightness.dark,
          rootTheme,
          true,
        )) {
    on<SwitchedTheme>((event, emit) async {
      ThemeData newTheme = ThemeData(
          fontFamily: 'Inter',
          colorSchemeSeed: event.color,
          useMaterial3: true,
          brightness: event.brightness);
      emit(state.copyWith(
          color: event.color, brightness: event.brightness, theme: newTheme));
      final prefs = await SharedPreferences.getInstance();
      prefs.setBool("dark", event.brightness == Brightness.dark);
      prefs.setInt("color", event.color.toARGB32());
    });

    on<CheckForTheme>(
      (event, emit) async {
        final prefs = await SharedPreferences.getInstance();
        if (prefs.containsKey("color") && prefs.containsKey("dark")) {
          Color color = Color(prefs.getInt("color")!);
          bool dark = prefs.getBool("dark")!;
          add(SwitchedTheme(color, dark ? Brightness.dark : Brightness.light));
        }
        bool notifyEvents = prefs.getBool(notifyEventsKey) ?? false;

        emit(state.copyWith(notifyEvents: notifyEvents));
      },
    );

    on<ToggleClass>(
      (event, emit) {
        emit(state.copyWith(hideExtraClasses: !state.hideExtraClasses));
      },
    );
  }
}

class SettingsState {
  final Color color;
  final Brightness brightness;
  final ThemeData theme;
  final bool hideExtraClasses;
  SettingsState(
    this.color,
    this.brightness,
    this.theme,
    this.hideExtraClasses,
  );

  SettingsState copyWith(
      {Color? color,
      Brightness? brightness,
      ThemeData? theme,
      bool? hideExtraClasses,
      bool? notifyEvents,
      bool? notifyDebug}) {
    return SettingsState(
      color ?? this.color,
      brightness ?? this.brightness,
      theme ?? this.theme,
      hideExtraClasses ?? this.hideExtraClasses,
    );
  }
}
