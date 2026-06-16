import 'package:flutter/material.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';

class NotReadyScreen extends StatelessWidget {
  const NotReadyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Illustration(illustration: "season_change"),
          Text(
            "Kommer snart",
            style: LppTypography.labelSmall(context),
          ),
        ],
      ),
    );
  }
}
