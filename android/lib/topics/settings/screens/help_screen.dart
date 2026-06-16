import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';
import 'package:url_launcher/url_launcher_string.dart';

class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const LppAppbar(title: "Hjælp"),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        child: Center(
          child: PaddedColumn(padding: 24.0, children: [
            const Illustration(illustration: "support"),
            PaddedColumn(padding: 4.0, children: [
              Text(
                "Brug for hjælp?",
                style: LppTypography.headlineSmall(context),
              ),
              Text(
                "Tryk på knappen nedenfor for at kontakte os på GitHub.",
                style: LppTypography.bodySmall(context),
              )
            ]),
            OverflowBar(
              spacing: 8.0,
              alignment: MainAxisAlignment.center,
              children: [
                FilledButton.icon(
                  onPressed: () async {
                    const url = "https://github.com/jonbng/betterlectio/issues";
                    if (await canLaunchUrlString(url)) {
                      launchUrlString(url);
                    }
                  },
                  label: const Text("GitHub"),
                  icon: const Icon(EvaIcons.githubOutline),
                ),
              ],
            )
          ]),
        ),
      ),
    );
  }
}
