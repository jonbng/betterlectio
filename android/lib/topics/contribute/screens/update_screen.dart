import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';
import 'package:url_launcher/url_launcher_string.dart';

class UpdateScreen extends StatelessWidget {
  const UpdateScreen({super.key});

  @override
  Widget build(BuildContext context) {
    RegExp whitespaceRE = RegExp(r"\s+");
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 32.0),
        child: PaddedColumn(
          padding: 16,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "BetterLectio er nu fri for reklamer",
              style: LppTypography.headlineSmall(context),
            ),
            Text(
              """Vent... Det bliver bedre endnu.
          BetterLectio er nu open-source, det betyder, at appen fortsat vil være 100% gratis.
          Derudover kan alle med interesse bidrage og skabe ny funktionalitet.
          Lyder det interessant? Følg linket nedenfor.
          """
                  .replaceAll(whitespaceRE, " "),
              style: LppTypography.bodySmall(context),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                FilledButton.icon(
                  onPressed: () {
                    launchUrlString("https://github.com/oscarspalk/lectio_plus_plus");
                  },
                  label: const Text("Github"),
                  icon: const Icon(EvaIcons.githubOutline),
                ),
              ],
            )
          ],
        ),
      ),
    );
  }
}
