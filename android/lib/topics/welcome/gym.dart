import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/logic/app/typography.dart';
import 'package:betterlectio/topics/welcome/bloc/login.dart';
import 'package:betterlectio/topics/welcome/screens/gym_select.dart';
import 'package:betterlectio/topics/welcome/widgets/illustration.dart';

class GymScreen extends StatelessWidget {
  const GymScreen({super.key, required this.next, required this.selectGym});

  final Function() next;
  final Function(int n) selectGym;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Illustration(
                illustration: "current_location",
              ),
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(children: [
                  Text(
                    "Næsten færdig",
                    style: LppTypography.headlineSmall(context),
                    textAlign: TextAlign.center,
                  ),
                  const Text(
                      "For at du kan fortsætte, så skal du vælge dit gymnasie",
                      textAlign: TextAlign.center),
                ]),
              ),
              OverflowBar(
                spacing: 8.0,
                alignment: MainAxisAlignment.center,
                children: [
                  FilledButton(
                    onPressed: () async {
                      await showSearch(
                          context: context,
                          delegate: SelectGym(context.read<LoginBloc>()));
                    },
                    child: const Text("Vælg"),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }
}
