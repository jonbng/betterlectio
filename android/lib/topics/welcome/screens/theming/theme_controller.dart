import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

import '../../../../logic/app/settings.dart';
import 'theme_button.dart';

class ThemeController extends StatelessWidget {
  ThemeController({
    super.key,
  });
  final List<Color> colors = [
    betterLectioPrimary,
    Colors.blue,
    Colors.green,
    Colors.red,
    Colors.purple,
    Colors.pink,
    Colors.orange,
    Colors.teal,
    Colors.lime,
    Colors.amber,
    Colors.deepPurple,
  ];

  final double spacing = 8.0;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<SettingsBloc, SettingsState>(
      builder: (context, state) {
        var light = state.brightness == Brightness.light;
        return SafeArea(
          child: Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 16.0, vertical: 24.0),
            child: PaddedColumn(
              padding: 24.0,
              children: [
                Text(
                  "Temaer",
                  style: BlTypography.headlineSmall(context),
                ),
                GridView.count(
                    padding: EdgeInsets.zero,
                    primary: false,
                    shrinkWrap: true,
                    crossAxisCount: 5,
                    mainAxisSpacing: spacing,
                    crossAxisSpacing: spacing,
                    children: colors
                        .map((color) => ThemeButton(
                              color: color,
                            ))
                        .toList()),
                FilledButton.icon(
                    icon: Icon(!light ? EvaIcons.moon : EvaIcons.sun),
                    onPressed: () {
                      context.read<SettingsBloc>().add(SwitchedTheme(
                          state.color,
                          light ? Brightness.dark : Brightness.light));
                    },
                    label: Text("Skift til ${light ? "mørk" : "lys"}")),
              ],
            ),
          ),
        );
      },
    );
  }
}
