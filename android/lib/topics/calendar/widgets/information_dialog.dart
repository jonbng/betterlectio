import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

class InformationsDialog extends StatelessWidget {
  const InformationsDialog({super.key, required this.informations});
  final List<String> informations;
  @override
  Widget build(BuildContext context) {
    return Dialog(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 24.0),
        child: PaddedColumn(
          padding: 16.0,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "Informationer",
              style: LppTypography.headlineSmall(context),
            ),
            ListView(
              padding: EdgeInsets.zero,
              shrinkWrap: true,
              children: [
                ...informations.map((information) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8.0),
                    child: Container(
                      decoration: BoxDecoration(
                          color:
                              Theme.of(context).colorScheme.secondaryContainer,
                          borderRadius:
                              const BorderRadius.all(Radius.circular(10.0))),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8.0, vertical: 8.0),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              information.trim(),
                              style: Theme.of(context)
                                  .textTheme
                                  .labelLarge!
                                  .copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSecondaryContainer),
                              textAlign: TextAlign.start,
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                })
              ],
            ),
          ],
        ),
      ),
    );
  }
}
