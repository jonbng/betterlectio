import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/l10n/helper.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/topics/welcome/screens/gym_select.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';
import 'package:betterlectio/widgets/layout/padded_column.dart';

class GymScreen extends StatelessWidget {
  const GymScreen({super.key, required this.next});

  final Function() next;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      child: Center(
        child: PaddedColumn(padding: 24.0, children: [
          const Illustration(
            illustration: "current_location",
          ),
          PaddedColumn(
            padding: 4.0,
            children: [
              Text(
                context.l10n.welcome_gym_title,
                style: BlTypography.headlineSmall(context),
                textAlign: TextAlign.center,
              ),
              Text(
                context.l10n.welcome_gym_description, 
                textAlign: TextAlign.center,
                style: BlTypography.bodySmall(context),
              ),
            ],
          ),
          FilledButton(
            onPressed: () async {
              await showSearch(
                  context: context,
                  delegate: SelectGym(context.read<LoginBloc>()));
            },
            child:  Text(context.l10n.welcome_gym_button),
          ),
        ]),
      ),
    );
  }
}
