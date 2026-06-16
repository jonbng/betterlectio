import 'package:eva_icons_flutter/eva_icons_flutter.dart';
import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/contribute/screens/update_screen.dart';
import 'package:betterlectio/topics/contribute/widgets/art.dart';

class HelpUsBar extends StatelessWidget {
  const HelpUsBar({super.key});

  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 8.0),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 90.0,
              child: GestureDetector(
                onTap: () {
                  showDialog(context: context, builder: (context) {
                    return UpdateScreen();
                  },);
                },
                child: Card.filled(
                  clipBehavior: Clip.hardEdge,
                  margin: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: AdFreeArt(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            "Har du opdaget?",
                            style: LppTypography.headlineSmall(context)
                                ?.copyWith(color: colorScheme.onTertiary),
                          ),
                          Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                EvaIcons.arrowForwardOutline,
                                color: colorScheme.onTertiary,
                              )
                            ],
                          )
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
