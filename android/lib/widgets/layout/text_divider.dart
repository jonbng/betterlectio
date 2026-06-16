import 'package:flutter/material.dart';

class TextDivider extends StatelessWidget {
  const TextDivider(
      {super.key,
      required this.text,
      this.large = false,
      this.primary = false,
      this.customText,
      this.padding});

  final String text;
  final Widget? customText;
  final bool large;
  final bool primary;
  final EdgeInsets? padding;
  @override
  Widget build(BuildContext context) {
    return Padding(
        padding: padding ?? const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: DefaultTextStyle(
            style: (large
                    ? Theme.of(context)
                        .textTheme
                        .titleLarge!
                        .copyWith(fontWeight: FontWeight.bold)
                    : Theme.of(context).textTheme.titleSmall)!
                .copyWith(
                    color:
                        primary ? Theme.of(context).colorScheme.primary : null),
            child: customText ??
                Text(
                  text,
                )));
  }
}
