import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';

class Stat {
  final String title;
  final String data;

  Stat({required this.title, required this.data});
}

class Statistic extends StatelessWidget {
  final String header;
  final List<Stat> stats;
  const Statistic({super.key, required this.header, required this.stats});

  final TextStyle headerStyle =
      const TextStyle(fontSize: 18.0, fontWeight: FontWeight.bold);
  final TextStyle statStyle = const TextStyle(fontStyle: FontStyle.italic);

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
          color: Theme.of(context).colorScheme.primaryContainer,
          child: Padding(
            padding:
                const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
                mainAxisAlignment: MainAxisAlignment.start,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    header,
                    style: BlTypography.labelSmall(context),
                    textAlign: TextAlign.left,
                  ),
                  ...stats.map((stat) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Divider(
                          color: Theme.of(context).colorScheme.onPrimary,
                        ),
                        Text(
                          stat.title.trim(),
                          style: BlTypography.bodySmall(context),
                        ),
                        Text(
                          stat.data.trim(),
                          overflow: TextOverflow.ellipsis,
                          style: BlTypography.headlineSmall(context),
                        ),
                      ],
                    );
                  })
                ]),
          )),
    );
  }
}
