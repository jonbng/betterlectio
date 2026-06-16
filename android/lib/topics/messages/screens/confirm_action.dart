import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';

class ConfirmAction extends StatelessWidget {
  const ConfirmAction(
      {super.key,
      required this.confirmText,
      required this.onConfirm,
      this.children});
  final String confirmText;
  final Function() onConfirm;
  final List<Widget>? children;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Illustration(illustration: "verified"),
          Padding(
            padding: const EdgeInsets.all(8.0),
            child: Text(
              confirmText,
              style: LppTypography.labelSmall(context),
              textAlign: TextAlign.center,
            ),
          ),
          if (children != null)
            ListView(
              shrinkWrap: true,
              children: children!,
            ),
          OverflowBar(
            spacing: 8.0,
            alignment: MainAxisAlignment.center,
            children: [
              FilledButton.tonal(
                  onPressed: () {
                    Navigator.pop(context);
                  },
                  child: const Text("Annuller")),
              FilledButton(onPressed: onConfirm, child: const Text("Bekræft"))
            ],
          )
        ],
      ),
    );
  }
}
