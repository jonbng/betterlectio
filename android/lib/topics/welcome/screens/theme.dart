import 'package:flutter/material.dart';
import 'package:betterlectio/l10n/helper.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/utils/ad_route.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

import 'theming/theme_controller.dart';

class ThemeScreen extends StatelessWidget {
  const ThemeScreen({super.key, required this.next});
  final Function() next;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: Center(
        child: PaddedColumn(padding: 24.0, children: [
          const Illustration(
            illustration: "adjustments",
          ),
          PaddedColumn(padding: 4.0, children: [
            Text(
              context.l10n.welcome_theme_title,
              style: LppTypography.headlineSmall(context),
              textAlign: TextAlign.center,
            ),
            Text(
              context.l10n.welcome_theme_description,
              textAlign: TextAlign.center,
              style: LppTypography.bodySmall(context),
            ),
          ]),
          OverflowBar(
            spacing: 8.0,
            alignment: MainAxisAlignment.center,
            children: [
              FilledButton(
                  onPressed: () {
                    adSheet(ThemeController(), context, ad: false);
                  },
                  child:  Text(context.l10n.welcome_theme_chose_theme)),
              FilledButton.tonal(onPressed: next, child:  Text(context.l10n.welcome_theme_next))
            ],
          )
        ]),
      ),
    );
  }
}
