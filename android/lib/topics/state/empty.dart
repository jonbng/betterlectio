import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

class EmptyScreen extends StatelessWidget {
  const EmptyScreen({super.key, this.text, this.noEvents = false});
  final String? text;
  final bool noEvents;
  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: Center(
        child: PaddedColumn(
          padding: 8.0,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Illustration(illustration: noEvents ? "relax" : "empty"),
            Text(
              text ?? "Der var tomt",
              style: LppTypography.headlineSmall(context),
              textAlign: TextAlign.center,
            )
          ],
        ),
      ),
    );
  }
}
